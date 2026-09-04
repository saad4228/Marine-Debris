import { cx } from '../lib/utils.js';

// tier: { id, label } from risk.js
export default function TierBadge({ tier, score, className }) {
  return (
    <span className={cx('tier', `tier-${tier.id}`, className)} title={score != null ? `Risk score ${score}` : undefined}>
      {tier.label}
      {score != null && <span className="num opacity-80">{score}</span>}
    </span>
  );
}
