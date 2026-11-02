import { z } from 'zod';
import type { AgentContext, Tool } from '../../ai/contracts.ts';
import type { TripHostOptions } from './host.ts';
import { createEmailSender, formatEmailTime } from './emailjs.ts';

export const EMAIL_TOOL = 'itinerary_request_email';
const schema=z.strictObject({request:z.string().trim().min(1).max(4000),
  contactName:z.string().trim().min(1).max(80).optional(),replyTo:z.email().max(254).optional()});
export function guestEmailAvailable(options: TripHostOptions) {
  return options.source==='trip' && !options.getSession() && !!options.email &&
    z.email().safeParse(options.config.emails[0]).success;
}
export function createGuestEmailTool(options: TripHostOptions): Tool {
  const recipient=options.config.emails[0];
  const trip=structuredClone(options.trip);
  const sender=options.email ? createEmailSender(options.email,options.fetcher) : null;
  function check(context: AgentContext,signal: AbortSignal) {
    signal.throwIfAborted();
    if (!guestEmailAvailable(options) || options.config.emails[0]!==recipient || context.scope!=='trip-itinerary' || context.scopeId!==trip.id || !context.permissions.includes('contact_guide'))
      throw new Error('目前無法代寄需求，請重新確認旅程與登入狀態。');
  }
  async function read(context: AgentContext,signal: AbortSignal) {
    check(context,signal);
    const data=await options.readData();
    check(context,signal);
    if (data.trip.id!==trip.id || data.trip.spreadsheetId!==trip.spreadsheetId || data.sectionErrors?.itinerary) throw new Error('旅程資料尚未就緒。');
  }
  return {name:EMAIL_TOOL,description:'未登入訪客想調整行程時，整理需求並詢問是否寄送給第一位導遊。只準備郵件預覽，使用者按確認寄送才會送出；不會修改行程。姓名及回覆信箱僅可使用本人明確提供的資訊，可省略，不得臆造。',
    risk:'write',schema,enabled:context=>context.permissions.includes('contact_guide') && guestEmailAvailable(options),
    async prepare(input,context,signal) {
      const draft=schema.parse(input);
      await read(context,signal);
      const requestId=crypto.randomUUID();
      const subject=`[行程調整需求] ${trip.name.replace(/[\r\n]+/g,' ')}`;
      const dates=`${trip.start.replaceAll('-','/')} - ${trip.end.replaceAll('-','/')}`;
      const message=[`旅程：${trip.name}`,`日期：${dates}`,'', '調整需求：',draft.request,'',
        `稱呼：${draft.contactName || '未知使用者'}`,`回覆信箱：${draft.replyTo || '未提供'}`,`需求編號：${requestId}`].join('\n');
      let consumed=false;
      return {preview:{summary:'是否要將以下行程調整需求寄送給導遊？',changes:[{operation:'create',after:{收件人:recipient,主旨:subject,內容:message}}],
        warnings: draft.replyTo ? ['此操作僅轉交需求，不會直接修改行程。'] : ['未提供回覆信箱；若需要導遊回覆，請取消並提供聯絡信箱後重新準備郵件。']},
        async commit(current,commitSignal) {
          if(consumed) return {status:'error',message:'此郵件已處理，請勿重複寄送。'};
          consumed=true;
          try {
            await read(current,commitSignal);
            check(current,commitSignal);
            await sender!.send({title:trip.name,name:draft.contactName || '未知使用者',time:formatEmailTime(new Date()),trip_name:trip.name,trip_dates:dates,subject,message,requester_name:draft.contactName || '未知使用者',reply_to:draft.replyTo || '',request_id:requestId},commitSignal);
            return {status:'success',data:{recipient,requestId},message:'郵件服務已接受寄送申請；不代表導遊已閱讀或已修改行程。'};
          } catch {return {status:'error',message:'郵件未確認寄送成功。請先確認收件情況，勿直接重送；行程未修改。'};}
        },
      };
    },
  };
}
