import type { ParticipantCurrent } from '@research/contracts';
export function RatingCard({
  card,
  value,
  disabled,
  onChange,
}: {
  card: NonNullable<ParticipantCurrent['rating_card']>;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset disabled={disabled} aria-label="观点评分卡">
      <legend>观点评分</legend>
      <p>评分对象：{card.belief}</p>
      <p>{card.instruction}</p>
      <p>0分：{card.low_anchor}</p>
      <label>
        当前评分
        <input
          name="rating"
          type="number"
          min={0}
          max={100}
          step={1}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <p>100分：{card.high_anchor}</p>
    </fieldset>
  );
}
