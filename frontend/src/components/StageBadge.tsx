import { memo } from 'react';
import type { Stage } from '../api/client';
import { STAGE_LABELS } from '../constants';

export const StageBadge = memo(function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`badge badge-${stage.toLowerCase()}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
});
