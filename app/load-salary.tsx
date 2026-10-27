/**
 * app/load-salary.tsx: load salary (PLAN F1), a placeholder until its phase is built.
 *
 * Layer: UI (Expo Router screen).
 */
import { NotYet } from '@/components/common/NotYet';

export default function LoadSalaryScreen() {
  return (
    <NotYet
      title="load salary"
      what="Record the salary received, what went to savings and to credit, your actual balances and the next pay date, then reset or edit your budget lines."
    />
  );
}
