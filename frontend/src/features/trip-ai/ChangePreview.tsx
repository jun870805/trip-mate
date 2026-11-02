import type { PendingPreview } from '../../ai/contracts.ts';
import { previewRows, displayAIText } from './preview';
import styles from './TripAIEntry.module.css';

export function ChangePreview({ preview, showIds, disabled, onApprove, onReject }: {
  preview: PendingPreview; showIds: boolean; disabled: boolean;
  onApprove(): void; onReject(): void;
}) {
  const destructive = preview.changes.some(change => change.operation === 'delete');
  const operations = { create: '新增', update: '修改', delete: '刪除', reorder: '排序' };
  return <section className={styles.preview} aria-label="待確認的行程變更">
    <h3>確認行程變更</h3>
    <p>{displayAIText(preview.summary, showIds)}</p>
    <p className={styles.hint}>共 {preview.changes.length} 筆受影響項目。{destructive && <span className={styles.warning}>包含刪除操作，儲存後無法復原。</span>}</p>
    {!!preview.warnings?.length && <ul className={styles.warnings}>{preview.warnings.map((warning, index) => <li key={index}>{displayAIText(warning, showIds)}</li>)}</ul>}
    <div className={styles.changes}>
      {preview.changes.map((change, index) => {
        const row = previewRows(change, showIds);
        return <article key={index} className={styles.change}>
          <h4>{operations[change.operation]} - {row.title}</h4>
          {row.id && <p className={styles.hint}>{row.id}</p>}
          <dl>{row.fields.map(field => <div className={styles.field} key={field.name}>
            <dt>{field.name}</dt>
            <dd>
              {change.operation !== 'create' && <div><span className={styles.valueLabel}>原本</span><div>{field.before}</div></div>}
              {change.operation !== 'delete' && <div><span className={styles.valueLabel}>儲存後</span><div>{field.after}</div></div>}
            </dd>
          </div>)}</dl>
        </article>;
      })}
    </div>
    <div className={styles.previewActions}>
      <button type="button" className="button secondary" disabled={disabled} onClick={onReject}>取消變更</button>
      <button type="button" className="button" disabled={disabled} onClick={onApprove}>{destructive ? '確認儲存並刪除' : '確認儲存'}</button>
    </div>
  </section>;
}
