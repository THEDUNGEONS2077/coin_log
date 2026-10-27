/**
 * components/form/Missing.tsx: a form page whose line or entry is gone.
 *
 * Layer: UI. A form opens for one line or entry (by ID). If that's no longer
 * there (an UNDO removed it, or it's in a closed cycle), the page says so
 * and offers the way back, rather than a form that can't work.
 */
import { router } from 'expo-router';

import { FormButton } from './FormButton';
import { FormPage } from './FormPage';

/** `> title`, a one-line reason, and [ BACK ]. */
export function Missing({ title, what }: { title: string; what: string }) {
  return (
    <FormPage
      title={title}
      closeLabel={`Close ${title}`}
      intro={what}
      actions={<FormButton label="BACK" onPress={() => router.back()} grow />}
    >
      {null}
    </FormPage>
  );
}
