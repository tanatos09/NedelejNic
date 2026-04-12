import React from 'react';
import { Dropdown } from '../ui/Dropdown';
import { useAdminStore } from '../../store/adminStore';
import type { User } from '../../types/admin';

interface ActionDropdownProps {
  userId: string;
  user: User;
}

export const ActionDropdown: React.FC<ActionDropdownProps> = ({ userId, user }) => {
  const store = useAdminStore();

  const options = [
    { label: 'Detail', value: 'view' },
    { label: 'Změnit roli', value: 'role' },
    { label: 'Nastavit level', value: 'level' },
    { label: 'Reset progresu', value: 'reset' },
    { label: user.isBanned ? 'Odbanovat' : 'Banovat', value: 'ban', danger: !user.isBanned },
  ];

  const handleAction = (action: string | number) => {
    switch (action) {
      case 'view':  store.openUserModal(userId); break;
      case 'role':  store.openRoleModal(userId); break;
      case 'level': store.openLevelModal(userId); break;
      case 'reset': store.confirmResetProgress(userId); break;
      case 'ban':   store.confirmToggleBan(userId, !user.isBanned); break;
    }
  };

  return <Dropdown options={options} onSelect={handleAction} triggerLabel="⋯" />;
};
