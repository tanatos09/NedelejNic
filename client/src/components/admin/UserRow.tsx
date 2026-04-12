import React from 'react';
import { ActionDropdown } from './ActionDropdown';
import type { User } from '../../types/admin';

interface UserRowProps {
  user: User;
  onSelect: (userId: string) => void;
}

const roleBadge: Record<string, string> = {
  PLAYER: 'bg-[#1a1a1a] text-[#888]',
  DEV:    'bg-[#1a1400] text-[#a07800]',
  ADMIN:  'bg-[#1a0000] text-[#cc4444]',
};

export const UserRow: React.FC<UserRowProps> = ({ user, onSelect }) => (
  <tr className="border-b border-[#111] hover:bg-[#0f0f0f] transition-colors">
    <td className="px-5 py-3">
      <button
        onClick={() => onSelect(user.id)}
        className="text-white hover:text-[#aaa] transition-colors font-medium"
      >
        {user.username}
      </button>
    </td>
    <td className="px-5 py-3">
      <span className={`inline-block text-[10px] font-bold tracking-[1px] px-2 py-0.5 rounded uppercase ${roleBadge[user.role] ?? roleBadge.PLAYER}`}>
        {user.role}
      </span>
    </td>
    <td className="px-5 py-3 text-[#555] tabular-nums">
      {user.level}
    </td>
    <td className="px-5 py-3">
      {user.isBanned ? (
        <span className="inline-block text-[10px] font-bold tracking-[1px] px-2 py-0.5 rounded uppercase bg-[#1a0000] text-red-500">
          Ban
        </span>
      ) : (
        <span className="inline-block text-[10px] font-bold tracking-[1px] px-2 py-0.5 rounded uppercase bg-[#001a08] text-green-600">
          Ok
        </span>
      )}
    </td>
    <td className="px-5 py-3 text-right">
      <ActionDropdown userId={user.id} user={user} />
    </td>
  </tr>
);
