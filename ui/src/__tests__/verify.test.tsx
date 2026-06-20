import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import VerifyIntegrations from '@/app/integrations/verify/page';

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>;
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('VerifyIntegrations Page', () => {
  const originalConfirm = window.confirm;
  const originalAlert = window.alert;

  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn().mockReturnValue(true);
    window.alert = jest.fn();

    // Mock localStorage
    let store: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        clear: () => { store = {}; }
      },
      writable: true
    });
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    window.alert = originalAlert;
  });

  it('renders verify integrations page with initial contract state', () => {
    render(<VerifyIntegrations />);

    expect(screen.getByText('LETHE // VERIFY')).toBeInTheDocument();
    expect(screen.getByText('Verified Contract Telemetry')).toBeInTheDocument();
    expect(screen.getByText('0x62a26532B0301a90f47c216e52438fa0fba67123')).toBeInTheDocument();
  });

  it('handles SLA slash simulation successfully', () => {
    render(<VerifyIntegrations />);

    const slashBtn = screen.getByRole('button', { name: 'Simulate SLA Slash' });
    fireEvent.click(slashBtn);

    expect(window.confirm).toHaveBeenCalledWith(
      'Trigger mock SLA violation slash? This simulates a data broker failing to delete within the 72 hour limit and awards $50.00 USDC to the user.'
    );
    expect(window.alert).toHaveBeenCalledWith(
      'Agent staked collateral slashed by $50.00 USDC. Compensation credited to user balance.'
    );

    // Verify updated values are displayed
    expect(screen.getByText('$450.00 USDC')).toBeInTheDocument();
    expect(screen.getByText('97.50%')).toBeInTheDocument();
    expect(screen.getByText('challengeSLA')).toBeInTheDocument();
  });

  it('does not slash if user cancels confirmation dialog', () => {
    window.confirm = jest.fn().mockReturnValue(false);
    render(<VerifyIntegrations />);

    const slashBtn = screen.getByRole('button', { name: 'Simulate SLA Slash' });
    fireEvent.click(slashBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();

    // Staked escrow should remain $500.00 USDC
    expect(screen.getAllByText('$500.00 USDC')[0]).toBeInTheDocument();
    expect(screen.getByText('100.00%')).toBeInTheDocument();
  });

  it('loads slashed state from localStorage if available', () => {
    window.localStorage.setItem('lethe_active_escrow', '$450.00 USDC');
    window.localStorage.setItem('lethe_sla_ratio', '97.50%');
    window.localStorage.setItem(
      'lethe_slashed_tx',
      JSON.stringify({
        hash: '0xmock...tx',
        method: 'challengeSLA',
        block: 4589210,
        age: 'Just now',
        status: 'success'
      })
    );

    render(<VerifyIntegrations />);

    expect(screen.getByText('$450.00 USDC')).toBeInTheDocument();
    expect(screen.getByText('97.50%')).toBeInTheDocument();
    expect(screen.getByText('challengeSLA')).toBeInTheDocument();
  });
});
