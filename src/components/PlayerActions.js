'use client'
import Hit from './actions/Hit.js'
import Stand from './actions/Stand.js'
import Double from './actions/Double.js'
import Split from './actions/Split.js'

export default function PlayerActions({ canSplit, canDouble, onDouble, onSplit }) {
    return (
        <div>
            <Hit />
            <Stand />
            <Double onDouble={onDouble} canDouble={canDouble} />
            {canSplit && <Split onSplit={onSplit} />}
        </div>
    )
}