import type { PendingPreview } from '../../ai/contracts';
import styles from './TripAIEntry.module.css';

export function EmailPreview({preview,disabled,onApprove,onReject}:{preview:PendingPreview;disabled:boolean;onApprove():void;onReject():void}) {
  const fields=preview.changes[0]?.after as Record<string,string>;
  return <section className={styles.preview} aria-label="待確認的需求郵件">
    <h3>寄送需求給導遊</h3>
    <p>是否寄送以下內容？此操作不會直接修改行程。</p>
    <dl className={styles.mailDetails}>
      {['收件人','主旨','內容'].map(name=><div key={name}><dt>{name}</dt><dd>{fields[name]}</dd></div>)}
    </dl>
    {!!preview.warnings?.length && <ul className={styles.warnings}>{preview.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}
    <div className={styles.previewActions}>
      <button type="button" className="button secondary" disabled={disabled} onClick={onReject}>取消寄送</button>
      <button type="button" className="button" disabled={disabled} onClick={onApprove}>確認寄送</button>
    </div>
  </section>;
}
