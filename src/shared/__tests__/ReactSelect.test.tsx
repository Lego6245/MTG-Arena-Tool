/* eslint-env jest */

import React from 'react';
import renderer from 'react-test-renderer';
import WrappedReactSelect from './WrappedReactSelect';


describe("ReactSelect", () => {
    it('renders the baseline', () => {
        let tree = renderer.create(<WrappedReactSelect />);
        expect(tree.toJSON()).toMatchSnapshot();
    });
    it('renders the options when clicked', () => {
        let tree = renderer.create(<WrappedReactSelect />);
        const buttonElement = tree.root.findByType("button");
        renderer.act(() => {
            buttonElement.props.onClick();
        });

        expect(tree.toJSON()).toMatchSnapshot();
    });
    it('renders the newly selected option', () => {
        let tree = renderer.create(<WrappedReactSelect />);
        const buttonElement = tree.root.findByType("button");
        renderer.act(() => {
            buttonElement.props.onClick();
        });
        const valueToTarget = "Red";
        const newOption = tree.root.findByProps({ value: valueToTarget });
        renderer.act(() => {
            newOption.props.onClick({ currentTarget: { value: valueToTarget } });
        });

        expect(tree.toJSON()).toMatchSnapshot();
    })
});