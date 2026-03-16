// Jest 测试设置
import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    };
  },
}));

// Mock Next/Image
jest.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage(props) {
    return <img {...props} />;
  },
}));
