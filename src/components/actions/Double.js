'use client'
export default function Double({ onDouble, canDouble }) {
    return (
        <button
            className="action-btn btn-double"
            onClick={onDouble}
            disabled={!canDouble}
        >
            Double <kbd className="key-hint">D</kbd>
        </button>
    )
}
