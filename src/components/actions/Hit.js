'use client'
import { useDeck } from "../../context/DeckContext";
import drawCard from "../../logic/drawCard";

export default function Hit() {
    const { deck, playerHand, setPlayerHand, setDeck, playerTurn } = useDeck();

    const handleHit = () => {
        // Only allow hit if it's player's turn and deck has cards
        if (playerTurn && deck.length > 0) {
            const {updatedHand, updatedDeck} = drawCard({hand: playerHand, deck: deck});
            // Add 1 second delay after drawing
            setTimeout(() => {
                setPlayerHand(updatedHand);
                setDeck(updatedDeck);
            }, 500);
        }
    };

    return (
        <button className="action-btn btn-hit" onClick={handleHit}>Hit</button>
    )
}