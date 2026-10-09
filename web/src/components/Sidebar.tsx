// The operator app's main navigation. Sections outside this demo are shown but disabled, and say so.
import { OPERATOR_NAME } from '../data/operator';
import type { Go, Page, TollsView } from '../navigation';
import { Icon, type IconName } from './Icon';

interface Item {
  label: string;
  icon: IconName;
  page?: Page; // no page: not part of this demo
  badge?: number;
}

interface Props {
  current: Page;
  go: Go;
  tollsView: TollsView;
  tollsBadge: number;
}

function isActive(item: Item, current: Page): boolean {
  if (!item.page) return false;
  const name = current.name === 'receipt' ? current.back.name : current.name;
  return item.page.name === name;
}

export function Sidebar({ current, go, tollsView, tollsBadge }: Props) {
  const groups: { title?: string; items: Item[] }[] = [
    {
      items: [
        { label: 'Dashboard', icon: 'dashboard', page: { name: 'dashboard' } },
        { label: 'Bookings', icon: 'bookings', page: { name: 'bookings' } },
        { label: 'Fleet', icon: 'fleet', page: { name: 'fleet' } },
        { label: 'Customers', icon: 'customers' },
        { label: 'Calendar', icon: 'calendar' },
      ],
    },
    {
      title: 'Money',
      items: [
        { label: 'Tolls', icon: 'tolls', page: { name: 'tolls', view: tollsView }, badge: tollsBadge },
        { label: 'Payouts', icon: 'payouts' },
      ],
    },
    {
      title: 'Business',
      items: [
        { label: 'Carisma', icon: 'carisma' },
        { label: 'Settings', icon: 'settings', page: { name: 'settings' } },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="operator">
        <span className="operator-mark" aria-hidden="true">
          SR
        </span>
        <span className="operator-text">
          <strong>{OPERATOR_NAME}</strong>
          <span className="muted small">Operator dashboard</span>
        </span>
      </div>

      <nav className="side-nav" aria-label="Main">
        {groups.map((group, index) => (
          <div className="side-group" key={group.title ?? index}>
            {group.title && <span className="side-group-title">{group.title}</span>}
            {group.items.map((item) =>
              item.page ? (
                <button
                  key={item.label}
                  className={`side-link${isActive(item, current) ? ' active' : ''}`}
                  aria-current={isActive(item, current) ? 'page' : undefined}
                  onClick={() => go(item.page!)}
                >
                  <Icon name={item.icon} />
                  <span className="side-label">{item.label}</span>
                  {item.badge ? (
                    <span className="nav-badge" aria-label={`${item.badge} waiting`}>
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              ) : (
                <span key={item.label} className="side-link disabled" title="Not part of this demo" aria-disabled="true">
                  <Icon name={item.icon} />
                  <span className="side-label">{item.label}</span>
                  <span className="side-soon">Not in demo</span>
                </span>
              ),
            )}
          </div>
        ))}
      </nav>

    </aside>
  );
}
