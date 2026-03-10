'use client'
import { useDeck } from "../../context/DeckContext";

export default function Stand() {
    const { setPlayerTurn } = useDeck();

    const handleStand = () => {
        setPlayerTurn(false);
    };

    return (
        <button className="action-btn btn-stand" onClick={handleStand}>Stand</button>
    )
}