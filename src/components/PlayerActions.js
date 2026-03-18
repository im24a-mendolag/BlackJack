'use client'
import Hit from './actions/Hit.js'
import Stand from './actions/Stand.js'
import Double from './actions/Double.js'
import Split from './actions/Split.js'
import Resign from './actions/Resign.js'

export default function PlayerActions({ hasSplitPair, canSplit, canDouble, canResign, onDouble, onSplit, onResign, onStand, onValidate, actionFeedback }) {
    return (
        <div className={`action-buttons-wrapper${actionFeedback ? ` feedback-${actionFeedback}` : ''}`}>
            <Hit onValidate={onValidate} />
            <Stand onValidate={onValidate} onStand={onStand} />
            <Double onDouble={onDouble} canDouble={canDouble} />
            {hasSplitPair && <Split onSplit={onSplit} canSplit={canSplit} />}
            <Resign onResign={onResign} canResign={canResign} />
        </div>
    )
}
