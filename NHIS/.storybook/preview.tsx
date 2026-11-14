import type { Preview } from '@storybook/react-vite';
import '../components/shared/fonts.css';
import { NHISProvider } from '../components/shared/NHISProvider';

const preview: Preview = {
  globalTypes: {
    review: {
      description: 'Validation review mode (not a theme). Grayscale = NHIS A2 check.',
      toolbar: {
        title: 'Review',
        icon: 'contrast',
        items: [
          { value: 'none', title: 'Normal' },
          { value: 'grayscale', title: 'Grayscale review (A2)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { review: 'none' },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    a11y: { test: 'todo' },
    options: {
      storySort: {
        order: ['Introduction', 'Foundations', 'Semantics', 'Station', ['Controls', 'Alerts', 'Health data', 'AI', 'Workflow'], 'Visualization', 'EVA (simulation)', 'Patterns'],
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <NHISProvider review={ctx.globals.review === 'grayscale' ? 'grayscale' : 'none'} style={{ minHeight: '100vh', padding: 24 }}>
        <Story />
      </NHISProvider>
    ),
  ],
};
export default preview;
