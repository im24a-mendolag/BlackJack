'use client'
export default function Split({ onSplit }) {
    return (
        <button className="action-btn btn-split" onClick={onSplit}>Split <kbd className="key-hint">A</kbd></button>
    )
}
