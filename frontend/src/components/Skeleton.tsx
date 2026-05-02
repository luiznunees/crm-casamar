import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--border) 50%, var(--bg-hover) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
        ...style,
      }}
    />
  );
}

export function LeadRowSkeleton() {
  return (
    <tr>
      <td><Skeleton width={140} height={14} style={{ marginBottom: 6 }} /><Skeleton width={100} height={11} /></td>
      <td><Skeleton width={80} height={14} /></td>
      <td><Skeleton width={60} height={20} borderRadius={999} /></td>
      <td><Skeleton width={24} height={14} /></td>
      <td><Skeleton width={20} height={14} /></td>
      <td><Skeleton width={70} height={14} /></td>
      <td><Skeleton width={28} height={28} borderRadius={6} /></td>
    </tr>
  );
}

export function ConversationSkeleton() {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <Skeleton width={120} height={14} />
        <Skeleton width={30} height={11} />
      </div>
      <Skeleton width="80%" height={12} />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="stat-card">
      <Skeleton width={80} height={11} style={{ marginBottom: 10 }} />
      <Skeleton width={50} height={28} />
    </div>
  );
}
