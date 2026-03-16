'use client'
export default function Split({ onSplit, canSplit }) {
    return (
        <button className="action-btn btn-split" onClick={onSplit} disabled={!canSplit}>Split <kbd className="key-hint">A</kbd></button>
    )
}
