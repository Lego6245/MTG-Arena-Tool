import { ReactSelect } from "../createSelect";
import React from 'react';

export default function WrappedReactSelect() {
    const sampleOptions = ["Red", "Blue", "Yellow", "Gold", "Silver", "Platinum", "Ruby", "Saphire", "Emerald"];
    return (
        <div className={"select_container foo"} id={"foo"}>
            <ReactSelect options={sampleOptions} current={"Emerald"} callback={() => undefined} />
        </div>
    );
}