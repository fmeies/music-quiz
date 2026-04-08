import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CodeGate from '../components/CodeGate';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CodeGate', () => {
  it('renders the access code form', () => {
    render(<CodeGate onVerified={() => {}} />);
    expect(screen.getByPlaceholderText('Access code')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDefined();
  });

  it('disables the submit button when input is empty', () => {
    render(<CodeGate onVerified={() => {}} />);
    const btn = screen.getByRole('button', {
      name: 'Continue',
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables the submit button when input has a value', async () => {
    render(<CodeGate onVerified={() => {}} />);
    const input = screen.getByPlaceholderText('Access code');
    fireEvent.change(input, { target: { value: 'mycode' } });
    const btn = screen.getByRole('button', {
      name: 'Continue',
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('calls onVerified with the code when server returns ok:true', async () => {
    const onVerified = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    });

    render(<CodeGate onVerified={onVerified} />);
    fireEvent.change(screen.getByPlaceholderText('Access code'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('secret'));
  });

  it('shows an error when server returns ok:false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false }),
    });

    render(<CodeGate onVerified={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Access code'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('Wrong code')).toBeDefined());
  });

  it('shows an error when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<CodeGate onVerified={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Access code'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('Wrong code')).toBeDefined());
  });
});
