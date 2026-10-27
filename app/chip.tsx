/**
 * app/chip.tsx: add, rename or remove a quick-select label (PLAN D29,
 * Settings → CHIPS).
 *
 *   > add label                    > edit label
 *   LABEL [Fuel]                   LABEL [Petrol]
 *   [ ADD ]                        [ REMOVE ]  [ SAVE ]
 *
 * Layer: UI (Expo Router screen). Route params: `kind` ('spend' for
 * transaction labels, 'income' for cash-in labels) and `index` (edit that
 * chip; none to add one). Entries already logged keep the label they were
 * given; only the chips change.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FormButton, FormPage, Missing, TextField } from '@/components/form';
import type { ChipKind } from '@/lib/ledger';
import { haptics } from '@/services/haptics';
import { useActions, useAppStore } from '@/store/react';

export default function ChipScreen() {
  const params = useLocalSearchParams<{ kind?: string; index?: string }>();
  const kind: ChipKind = params.kind === 'income' ? 'income' : 'spend';
  const chips = useAppStore((s) => s.ledger.chips[kind]);
  const index = params.index !== undefined ? Number(params.index) : null;
  if (index !== null && chips[index] === undefined) return <Missing title="edit label" what="That label isn't there any more." />;
  return <ChipForm kind={kind} index={index} initial={index !== null ? chips[index]! : ''} />;
}

function ChipForm({ kind, index, initial }: { kind: ChipKind; index: number | null; initial: string }) {
  const actions = useActions();
  const [label, setLabel] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const what = kind === 'spend' ? 'Transaction labels' : 'Cash-in labels';

  const save = () => {
    const outcome = index === null ? actions.addChip(kind, label) : actions.renameChip(kind, index, label);
    if (outcome) return setError(outcome);
    haptics.check();
    router.back();
  };
  const remove = () => {
    if (index === null) return;
    const outcome = actions.removeChip(kind, index);
    if (outcome) return setError(outcome);
    haptics.delete();
    router.back();
  };

  return (
    <FormPage
      title={index === null ? 'add label' : 'edit label'}
      closeLabel="Cancel"
      intro={`${what}: a tap fills in the label when you log. Entries already logged keep their label.`}
      error={error}
      actions={
        <>
          {index !== null && <FormButton label="REMOVE" onPress={remove} grow accessibilityLabel="Remove the label" />}
          <FormButton
            label={index === null ? 'ADD' : 'SAVE'}
            onPress={save}
            primary
            grow
            accessibilityLabel={index === null ? 'Add the label' : 'Save the label'}
          />
        </>
      }
    >
      <TextField label="LABEL" value={label} onChange={setLabel} autoFocus placeholder={kind === 'spend' ? 'e.g. Fuel' : 'e.g. Refund'} />
    </FormPage>
  );
}
