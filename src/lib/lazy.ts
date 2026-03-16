import dynamic from 'next/dynamic';

/**
 * 懒加载组件工厂
 * 用于优化首屏加载性能
 */

interface LazyLoadOptions {
  ssr?: boolean;
  loading?: React.ComponentType;
}

export function createLazyComponent<T extends Record<string, any>>(
  importFn: () => Promise<T>,
  options: LazyLoadOptions = {}
) {
  const { ssr = true, loading: LoadingComponent } = options;
  
  return dynamic(importFn, {
    ssr,
    loading: LoadingComponent,
    suspense: true,
  });
}

// 示例用法
// const AnalysisPage = createLazyComponent(
//   () => import('@/app/analysis/[id]/page'),
//   { ssr: false }
// );
