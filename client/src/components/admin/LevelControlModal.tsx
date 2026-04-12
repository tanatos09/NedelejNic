import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useAdminStore } from '../../store/adminStore';
import { useSetUserLevelMutation } from '../../hooks/useAdminQueries';

export const LevelControlModal: React.FC = () => {
  const {
    levelControlModalOpen,
    selectedUserId,
    closeLevelControlModal,
    showToast,
    setActionLoading,
    isActionLoading,
  } = useAdminStore();

  const [newLevel, setNewLevel] = useState<number>(1);
  const { mutate: setLevel } = useSetUserLevelMutation();

  if (!levelControlModalOpen || !selectedUserId) return null;

  const handleSetLevel = async () => {
    const levelNum = parseInt(String(newLevel), 10);

    if (isNaN(levelNum) || levelNum < 1 || levelNum > 100) {
      showToast({
        type: 'error',
        message: 'Level must be between 1 and 100',
        duration: 3000,
      });
      return;
    }

    setActionLoading(`set_level_${selectedUserId}`, true);

    try {
      setLevel(
        { userId: selectedUserId, level: levelNum },
        {
          onSuccess: () => {
            showToast({
              type: 'success',
              message: `Level set to ${levelNum}`,
              duration: 3000,
            });
            closeLevelControlModal();
          },
          onError: (error) => {
            showToast({
              type: 'error',
              message: error.message || 'Failed to set level',
              duration: 3000,
            });
          },
          onSettled: () => {
            setActionLoading(`set_level_${selectedUserId}`, false);
          },
        }
      );
    } catch (error) {
      showToast({
        type: 'error',
        message: 'An error occurred',
        duration: 3000,
      });
      setActionLoading(`set_level_${selectedUserId}`, false);
    }
  };

  const isLoading = isActionLoading(`set_level_${selectedUserId}`);

  return (
    <Modal
      isOpen={levelControlModalOpen}
      onClose={closeLevelControlModal}
      title="Set User Level"
    >
      <div className="space-y-5">
        <p className="text-[#888] text-sm">Nastav herní level uživatele (1–100)</p>

        <div>
          <label className="block text-[10px] font-bold tracking-[2px] text-[#444] uppercase mb-2">Nový level</label>
          <input
            type="number"
            min={1}
            max={100}
            value={newLevel}
            onChange={(e) => setNewLevel(parseInt(e.target.value, 10))}
            placeholder="1–100"
            className="w-full bg-[#111] border border-[#222] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-[#444] placeholder-[#333]"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[1, 20, 50].map((v) => (
            <button
              key={v}
              onClick={() => setNewLevel(v)}
              className="py-2 text-xs text-[#666] hover:text-white border border-[#1a1a1a] hover:border-[#333] rounded transition-colors"
            >
              {v === 1 ? 'Reset na 1' : v === 20 ? 'Nastav na 20' : 'Polovina (50)'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t border-[#1a1a1a] pt-4">
        <button
          onClick={closeLevelControlModal}
          disabled={isLoading}
          className="px-4 py-2 text-sm text-[#666] hover:text-white border border-[#222] hover:border-[#444] rounded transition-colors disabled:opacity-40"
        >
          Zrušit
        </button>
        <button
          onClick={handleSetLevel}
          disabled={isLoading}
          className="px-4 py-2 text-sm bg-white hover:bg-[#ddd] text-black rounded transition-colors disabled:opacity-40"
        >
          {isLoading ? '...' : 'Nastav level'}
        </button>
      </div>
    </Modal>
  );
};
