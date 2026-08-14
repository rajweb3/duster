interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-border rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 bg-border rounded w-1/3 mb-4" />
      <div className="h-6 bg-border rounded w-1/2 mb-2" />
      <div className="h-3 bg-border rounded w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card animate-pulse py-3">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-border rounded w-1/3" />
              <div className="h-3 bg-border rounded w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 bg-border rounded w-48 mb-2" />
          <div className="h-4 bg-border rounded w-64" />
        </div>
        <div className="h-6 bg-border rounded w-20" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <div className="h-3 bg-border rounded w-1/2 mb-3" />
            <div className="h-7 bg-border rounded w-1/3" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="h-5 bg-border rounded w-1/4 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2">
              <div className="space-y-1">
                <div className="h-4 bg-border rounded w-32" />
                <div className="h-3 bg-border rounded w-20" />
              </div>
              <div className="h-5 bg-border rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
