import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MasteryBadge } from './MasteryBadge';

describe('MasteryBadge', () => {
  it('labels weak mastery', () => {
    render(<MasteryBadge score={0.32} />);

    expect(screen.getByText('32%')).toBeInTheDocument();
    expect(screen.getByText('Weak')).toBeInTheDocument();
  });

  it('supports compact display', () => {
    render(<MasteryBadge score={0.91} compact />);

    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.queryByText('Mastered')).not.toBeInTheDocument();
  });
});
