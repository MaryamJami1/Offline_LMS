import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextAreaField, TextField } from './form-fields.js';

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
