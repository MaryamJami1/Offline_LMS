import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge.js';
import { Card } from './card.js';
import { LevelMeter } from './level-meter.js';
import { ProgressBar } from './progress-bar.js';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table.js';

/**
 * NFR-11: the components that show rather than take input. Each says what it
 * shows to a screen reader, and none shows a state by colour alone.
 */

describe('NFR-11 Card', () => {
  it('is a region named by its heading', () => {
    render(<Card title="Lab now">30 of 30 seats online</Card>);

    expect(screen.getByRole('region', { name: 'Lab now' })).toHaveTextContent(
      '30 of 30 seats online',
    );
    expect(screen.getByRole('heading', { name: 'Lab now' })).toHaveClass('text-ink-muted');
  });

  it('can do without a heading', () => {
    render(<Card>Plain</Card>);

    expect(screen.getByText('Plain')).toHaveClass('bg-surface', 'border-border');
  });
});

describe('NFR-11 Badge', () => {
  it('comes in the five tones of 05, each a word on its tint', () => {
    render(
      <>
        <Badge tone="live">On call</Badge>
        <Badge tone="info">New</Badge>
        <Badge tone="ok">Online</Badge>
        <Badge tone="warn">Draft</Badge>
        <Badge tone="muted">Offline</Badge>
      </>,
    );

    expect(screen.getByText('On call')).toHaveClass('bg-live-tint', 'text-live');
    expect(screen.getByText('New')).toHaveClass('bg-primary-tint', 'text-primary');
    expect(screen.getByText('Online')).toHaveClass('bg-success-tint', 'text-success');
    expect(screen.getByText('Draft')).toHaveClass('bg-warning-tint', 'text-warning-text');
    expect(screen.getByText('Offline')).toHaveClass('bg-muted', 'text-ink-muted');
  });

  it('is never smaller than 13 px text (NFR-11)', () => {
    render(<Badge tone="muted">Muted</Badge>);

    expect(screen.getByText('Muted')).toHaveClass('text-[13px]');
  });
});

describe('NFR-11 Progress bar', () => {
  it('is a named progress bar with its value', () => {
    render(<ProgressBar label="Reading" value={40} />);

    const bar = screen.getByRole('progressbar', { name: 'Reading' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('keeps a value inside its range', () => {
    render(
      <>
        <ProgressBar label="Over" value={130} />
        <ProgressBar label="Under" value={-5} />
        <ProgressBar label="Of ten" value={3} max={10} />
      </>,
    );

    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.getByRole('progressbar', { name: 'Under' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    const ofTen = screen.getByRole('progressbar', { name: 'Of ten' });
    expect(ofTen).toHaveAttribute('aria-valuemax', '10');
    expect(ofTen.firstElementChild).toHaveStyle({ width: '30%' });
  });

  it('can say what the value means', () => {
    render(<ProgressBar label="Quiz" value={18} max={30} valueText="18 of 30 answered" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '18 of 30 answered');
  });
});

describe('NFR-11 Level meter', () => {
  it('is a named meter from 0 to 100', () => {
    render(<LevelMeter label="Talk level" level={0.42} />);

    const meter = screen.getByRole('meter', { name: 'Talk level' });
    expect(meter).toHaveAttribute('aria-valuenow', '42');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });

  it('lights one segment in ten for each tenth of the level', () => {
    render(<LevelMeter label="Mic" level={0.35} />);

    const segments = screen.getByRole('meter').querySelectorAll('[data-lit]');
    expect(segments).toHaveLength(10);
    expect([...segments].filter((s) => s.getAttribute('data-lit') === 'true')).toHaveLength(4);
  });

  it('keeps a level between silence and full', () => {
    render(
      <>
        <LevelMeter label="Loud" level={1.7} />
        <LevelMeter label="Quiet" level={-1} />
      </>,
    );

    expect(screen.getByRole('meter', { name: 'Loud' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('meter', { name: 'Quiet' })).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('NFR-11 Table', () => {
  it('is a table named by its caption, with column headers', () => {
    render(
      <Table>
        <TableCaption>Students</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Student ID</TableHead>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>S-1001</TableCell>
            <TableCell>Ayesha Khan</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('table', { name: 'Students' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Student ID' })).toHaveAttribute(
      'scope',
      'col',
    );
    expect(screen.getByRole('cell', { name: 'Ayesha Khan' })).toBeInTheDocument();
  });
});
