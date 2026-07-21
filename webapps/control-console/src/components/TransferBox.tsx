import { useState, useMemo } from 'react';
import { buttonVariants } from '../variants';
import mergeTW from '../utils/mergeTW';

interface TransferBoxProps {
  available: string[];           // Column 1: members
  selected: string[];            // Column 2: excluded
  selfIdentified: string;        // Column 3: "This is me" (max 1)
  onChange: (selected: string[], selfIdentified: string) => void;
  onClose: () => void;
  onDone: () => void;
}

export default function TransferBox({ available, selected, selfIdentified, onChange, onClose, onDone }: TransferBoxProps) {
  const [sourceChecked, setSourceChecked] = useState<Set<string>>(new Set());
  const [targetChecked, setTargetChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const filteredAvailable = useMemo(
    () => search ? available.filter(a => a.toLowerCase().includes(search.toLowerCase())) : available,
    [available, search]
  );

  const filteredSelected = useMemo(
    () => search ? selected.filter(s => s.toLowerCase().includes(search.toLowerCase())) : selected,
    [selected, search]
  );

  const toggleSource = (item: string) => {
    setSourceChecked(prev => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  };

  const toggleTarget = (item: string) => {
    setTargetChecked(prev => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  };

  // col1 → col2: move checked available items to excluded
  const moveToTarget = () => {
    const toMove = sourceChecked.size > 0
      ? [...sourceChecked].filter(a => available.includes(a))
      : [...filteredAvailable];
    onChange([...selected, ...toMove.filter(a => !selected.includes(a))], selfIdentified);
    setSourceChecked(new Set());
    setTargetChecked(new Set());
  };

  // col2 → col1: move checked excluded items back to members
  const moveToSource = () => {
    const toMove = targetChecked.size > 0
      ? [...targetChecked].filter(s => selected.includes(s))
      : [...filteredSelected];
    onChange(selected.filter(s => !toMove.includes(s)), selfIdentified);
    setSourceChecked(new Set());
    setTargetChecked(new Set());
  };

  // col2 → col3: COPY first checked item to self (stays in Excluded too)
  const moveToSelf = () => {
    const checked = [...targetChecked].filter(s => selected.includes(s));
    if (checked.length === 0) return;
    const newSelf = checked[0];
    // Keep newSelf in Excluded (copy, not move). Old self goes back to Excluded.
    const newSelected = [...selected];
    if (selfIdentified && selfIdentified !== newSelf && !newSelected.includes(selfIdentified)) {
      newSelected.push(selfIdentified);
    }
    onChange(newSelected, newSelf);
    setSourceChecked(new Set());
    setTargetChecked(new Set());
  };

  // col3 → col2: remove self (item already in Excluded, just clear Self)
  const moveFromSelf = () => {
    if (!selfIdentified) return;
    // Don't duplicate — Self is a copy, the item stays in Excluded
    const newSelected = selected.includes(selfIdentified)
      ? selected
      : [...selected, selfIdentified];
    onChange(newSelected, '');
    setSourceChecked(new Set());
    setTargetChecked(new Set());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-[960px] mx-4 bg-[#0f0f14] border border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-[#f2f5f8] text-base font-semibold">Agent Exclusion Setting</h3>
          <button
            onClick={onClose}
            className="text-[#8b95a5] hover:text-[#f2f5f8] transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
          />
        </div>

        {/* Transfer columns */}
        <div className="flex gap-0 px-5 py-4">
          {/* Column 1: members */}
          <div className="flex-1 border border-white/10 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
              <span className="text-[#8b95a5] text-xs font-medium">members</span>
              <span className="text-[#8b95a5] text-xs">{filteredAvailable.length} items</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredAvailable.length === 0 ? (
                <div className="px-3 py-8 text-center text-[#8b95a5] text-xs">No available members</div>
              ) : (
                filteredAvailable.map(item => {
                  const isChecked = sourceChecked.has(item);
                  return (
                    <div
                      key={item}
                      onClick={() => toggleSource(item)}
                      className={`px-3 py-2 cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-500/15 border-l-2 border-blue-400'
                          : 'hover:bg-white/[0.04] border-l-2 border-transparent'
                      }`}
                    >
                      <span className="text-[#f2f5f8] text-sm">{item}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Col1 ↔ Col2 buttons */}
          <div className="flex flex-col items-center justify-center gap-2 px-3">
            <button
              onClick={moveToTarget}
              disabled={filteredAvailable.length === 0}
              className={mergeTW(
                buttonVariants.secondary,
                'w-8 h-8 flex items-center justify-center p-0 text-lg rounded-lg'
              )}
              title="Add to exclusions"
            >
              →
            </button>
            <button
              onClick={moveToSource}
              disabled={filteredSelected.length === 0}
              className={mergeTW(
                buttonVariants.secondary,
                'w-8 h-8 flex items-center justify-center p-0 text-lg rounded-lg'
              )}
              title="Remove from exclusions"
            >
              ←
            </button>
          </div>

          {/* Column 2: Excluded */}
          <div className="flex-1 border border-white/10 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
              <span className="text-[#8b95a5] text-xs font-medium">Excluded</span>
              <span className="text-[#8b95a5] text-xs">{filteredSelected.length} items</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredSelected.length === 0 ? (
                <div className="px-3 py-8 text-center text-[#8b95a5] text-xs">No excluded members</div>
              ) : (
                filteredSelected.map(item => {
                  const isChecked = targetChecked.has(item);
                  return (
                    <div
                      key={item}
                      onClick={() => toggleTarget(item)}
                      className={`px-3 py-2 cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-500/15 border-l-2 border-blue-400'
                          : 'hover:bg-white/[0.04] border-l-2 border-transparent'
                      }`}
                    >
                      <span className="text-[#f2f5f8] text-sm">{item}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Col2 ↔ Col3 buttons */}
          <div className="flex flex-col items-center justify-center gap-2 px-3">
            <button
              onClick={moveToSelf}
              disabled={filteredSelected.length === 0}
              className={mergeTW(
                buttonVariants.secondary,
                'w-8 h-8 flex items-center justify-center p-0 text-lg rounded-lg'
              )}
              title='Set as "This is me"'
            >
              →
            </button>
            <button
              onClick={moveFromSelf}
              disabled={!selfIdentified}
              className={mergeTW(
                buttonVariants.secondary,
                'w-8 h-8 flex items-center justify-center p-0 text-lg rounded-lg'
              )}
              title='Remove "This is me"'
            >
              ←
            </button>
          </div>

          {/* Column 3: Self (This is me, max 1) */}
          <div className="flex-1 border border-amber-500/30 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-amber-500/30 bg-amber-500/[0.03]">
              <span className="text-amber-400 text-xs font-medium">Self</span>
              <span className="text-amber-400/60 text-xs">{selfIdentified ? '1' : '0'}/1</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {!selfIdentified ? (
                <div className="px-3 py-8 text-center text-[#8b95a5] text-xs">
                  Select from Excluded and click →
                </div>
              ) : (
                <div
                  className="px-3 py-2 cursor-default bg-amber-500/15 border-l-2 border-amber-400"
                >
                  <span className="text-amber-300 text-sm font-medium">{selfIdentified}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg bg-[#2c6bed] text-[#cdd5df] hover:bg-[#1e5bd5] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDone}
            className={mergeTW(buttonVariants.default)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
