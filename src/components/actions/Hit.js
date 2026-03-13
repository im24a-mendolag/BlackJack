'use client'
import { useDeck } from "../../context/DeckContext";
import drawCard from "../../logic/drawCard";

export default function Hit({ onValidate }) {
    const { deck, playerHand, setPlayerHand, setDeck, playerTurn } = useDeck();

    const handleHit = () => {
        // Only allow hit if it's player's turn and deck has cards
        if (playerTurn && deck.length > 0) {
            if (onValidate) onValidate('hit');
            const {updatedHand, updatedDeck} = drawCard({hand: playerHand, deck: deck});
            setTimeout(() => {
                setPlayerHand(updatedHand);
                setDeck(updatedDeck);
            }, 500);
        }
    };

    return (
        <button className="action-btn btn-hit" onClick={handleHit}>Hit <kbd className="key-hint">W</kbd></button>
    )
}