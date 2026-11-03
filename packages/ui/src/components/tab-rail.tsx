import type { ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { cn } from '../lib/cn.js';
import { FOCUS_RING } from '../lib/focus.js';

export interface RailTab {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface TabRailProps {
  /** What the list of tabs is, for screen readers. */
  label: string;
  tabs: RailTab[];
  value: string;
  onValueChange: (value: string) => void;
  /** The TabPanels, one per tab. */
  children?: ReactNode;
}

/**
 * The console's left rail of sections (T-02). Arrow Up and Down, Home and End
 * move between tabs and show each one's panel at once.
 */
export function TabRail({ label, tabs, value, onValueChange, children }: TabRailProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange}
      orientation="vertical"
      className="flex gap-4"
    >
      <Tabs.List aria-label={label} className="flex flex-col gap-1">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'flex min-h-10 w-16 cursor-pointer flex-col items-center gap-1 rounded-control py-2.5 text-[13px] font-medium',
              'text-ink-subtle hover:bg-bg',
              'data-[state=active]:bg-primary-tint data-[state=active]:font-semibold data-[state=active]:text-primary',
              FOCUS_RING,
            )}
          >
            {tab.icon !== undefined && (
              <span aria-hidden="true" className="flex">
                {tab.icon}
              </span>
            )}
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Tabs.Content value={value} className={cn('flex-1', FOCUS_RING)}>
      {children}
    </Tabs.Content>
  );
}
