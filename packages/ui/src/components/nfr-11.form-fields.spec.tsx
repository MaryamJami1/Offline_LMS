import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckboxGroup, SelectField, TextAreaField, TextField } from './form-fields.js';

/**
 * NFR-11: form fields. Every input has a label; an error sits next to its
 * field and is read with it; what was typed survives the error (05).
 */

describe('NFR-11 Text field', () => {
  it('is an input named by its label', () => {
    render(<TextField label="Student ID" name="username" />);

    expect(screen.getByRole('textbox', { name: 'Student ID' })).toHaveAttribute('name', 'username');
  });

  it('reads a hint with the field', () => {
    render(<TextField label="New password" hint="At least 8 characters" type="password" />);

    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      'At least 8 characters',
    );
  });

  it('shows an error next to the field, marks it invalid, and reads the error with it', () => {
    render(<TextField label="Student ID" error="No such student ID" />);

    const input = screen.getByRole('textbox', { name: 'Student ID' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('No such student ID');
    expect(screen.getByText('No such student ID')).toHaveClass('text-live');
    expect(input).toHaveClass('border-live');
  });

  it('keeps what was typed when an error appears', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TextField label="Student ID" />);
    await user.type(screen.getByRole('textbox'), 'S-1O01');

    rerender(<TextField label="Student ID" error="No such student ID" />);

    expect(screen.getByRole('textbox')).toHaveValue('S-1O01');
  });

  it('is reached with Tab and shows the focus ring, 40 px tall', async () => {
    const user = userEvent.setup();
    render(<TextField label="Name" />);

    await user.tab();

    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByRole('textbox')).toHaveClass('min-h-10', 'focus-visible:outline-primary');
  });

  it('can hide its label from view and still be named by it, as the search box on A-02 is', () => {
    render(<TextField label="Search students" hideLabel placeholder="Search by name or ID" />);

    expect(screen.getByRole('textbox', { name: 'Search students' })).toBeInTheDocument();
    expect(screen.getByText('Search students')).toHaveClass('sr-only');
  });
});

describe('NFR-11 Select field', () => {
  it('can hide its label from view and still be named by it', () => {
    render(
      <SelectField label="Class" hideLabel defaultValue="">
        <option value="">All classes</option>
      </SelectField>,
    );

    expect(screen.getByRole('combobox', { name: 'Class' })).toBeInTheDocument();
    expect(screen.getByText('Class')).toHaveClass('sr-only');
  });

  it('is a list box named by its label, with its choices', async () => {
    const user = userEvent.setup();
    render(
      <SelectField label="Class" defaultValue="">
        <option value="">All classes</option>
        <option value="B-12">B-12 · Spoken English</option>
      </SelectField>,
    );

    const select = screen.getByRole('combobox', { name: 'Class' });
    await user.selectOptions(select, 'B-12');

    expect(select).toHaveValue('B-12');
  });

  it('shows an error next to the field and reads it with the field', () => {
    render(
      <SelectField label="Batch" error="Choose a batch">
        <option value="">Choose…</option>
      </SelectField>,
    );

    const select = screen.getByRole('combobox', { name: 'Batch' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Choose a batch');
    expect(select).toHaveClass('border-live', 'min-h-10');
  });

  it('is reached with Tab and shows the focus ring', async () => {
    const user = userEvent.setup();
    render(
      <SelectField label="Lab">
        <option>Lab 1</option>
      </SelectField>,
    );

    await user.tab();

    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('combobox')).toHaveClass('focus-visible:outline-primary');
  });
});

describe('NFR-11 Checkbox group', () => {
  const DAYS = [
    { value: 'mon', label: 'Mon' },
    { value: 'tue', label: 'Tue' },
    { value: 'wed', label: 'Wed' },
  ];

  it('is a group named by its legend, one checkbox per choice', () => {
    render(<CheckboxGroup legend="Days" options={DAYS} value={['tue']} onChange={() => {}} />);

    const group = screen.getByRole('group', { name: 'Days' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mon' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tue' })).toBeChecked();
  });

  it('adds and removes a choice with a click or Space, keeping the order of the options', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CheckboxGroup legend="Days" options={DAYS} value={['wed']} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Mon' }));
    expect(onChange).toHaveBeenLastCalledWith(['mon', 'wed']);

    screen.getByRole('checkbox', { name: 'Wed' }).focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('gives each choice a 40 px target and the focus ring', () => {
    render(<CheckboxGroup legend="Days" options={DAYS} value={[]} onChange={() => {}} />);

    expect(screen.getByText('Mon').closest('label')).toHaveClass('min-h-10');
    expect(screen.getByRole('checkbox', { name: 'Mon' })).toHaveClass(
      'focus-visible:outline-primary',
    );
  });

  it('reads an error with the group', () => {
    render(
      <CheckboxGroup
        legend="Days"
        options={DAYS}
        value={[]}
        onChange={() => {}}
        error="Choose at least one day"
      />,
    );

    expect(screen.getByRole('group', { name: 'Days' })).toHaveAccessibleDescription(
      'Choose at least one day',
    );
  });
});

describe('NFR-11 Text area field', () => {
  it('works the same way for long answers', () => {
    render(<TextAreaField label="Your essay" error="Write at least 120 words" />);

    const area = screen.getByRole('textbox', { name: 'Your essay' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area).toHaveAccessibleDescription('Write at least 120 words');
  });
});
