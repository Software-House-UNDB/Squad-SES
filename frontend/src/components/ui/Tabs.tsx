import type { LucideIcon } from 'lucide-react';
import './ui.css';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Abas simples controladas pelo componente pai.
 * `items`: [{ value, label, icon: Component }]
 */
export default function Tabs<T extends string>({ items, value, onChange }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => {
        const isSelected = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`tabs__item ${isSelected ? 'tabs__item--active' : ''}`}
            onClick={() => onChange(item.value)}
          >
            {Icon && <Icon size={16} strokeWidth={2} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
