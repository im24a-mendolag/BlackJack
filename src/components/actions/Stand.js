'use client'
import { useDeck } from "../../context/DeckContext";

export default function Stand({ onValidate }) {
    const { setPlayerTurn } = useDeck();

    const handleStand = () => {
        if (onValidate) onValidate('stand');
        setPlayerTurn(false);
    };

    return (
        <button className="action-btn btn-stand" onClick={handleStand}>Stand <kbd className="key-hint">S</kbd></button>
    )
}