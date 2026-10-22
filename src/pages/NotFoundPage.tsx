import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/primitives';
import { buttonClass } from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass className="size-6" />}
      title="Page not found"
      description="This page does not exist. It may have been a deleted study set."
      actions={
        <Link to="/" className={buttonClass('primary')}>
          Go to dashboard
        </Link>
      }
    />
  );
}
