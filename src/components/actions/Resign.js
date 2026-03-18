'use client'
export default function Resign({ onResign, canResign }) {
    return (
        <button className="action-btn btn-resign" onClick={onResign} disabled={!canResign}>
            Resign <kbd className="key-hint">R</kbd>
        </button>
    )
}
