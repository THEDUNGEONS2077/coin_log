/**
 * app/spend.tsx: log a transaction (PLAN F2), a placeholder until its phase is built.
 *
 * Layer: UI (Expo Router screen).
 */
import { NotYet } from '@/components/common/NotYet';

export default function SpendScreen() {
  return (
    <NotYet
      title="log transaction"
      what="Log a card tap: choose credit or debit, type the amount and a label, then split it over that side's budget lines and spare."
    />
  );
}
