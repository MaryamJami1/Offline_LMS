import { Link } from 'react-router';
import { Button } from '@lingualab/ui';
import { PageHeader } from '../layout/page-header.js';

/** Sections of the prototype that are not built yet, and mistyped addresses. */
export function NotFoundScreen() {
  return (
    <>
      <PageHeader
        title="Not here yet"
        subtitle="This part of the panel is not built yet, or the address is wrong."
      />
      <div>
        <Button asChild>
          <Link to="/">Back to the dashboard</Link>
        </Button>
      </div>
    </>
  );
}
