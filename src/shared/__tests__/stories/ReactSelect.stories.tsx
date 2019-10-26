import React from 'react';
import { storiesOf } from '@storybook/react';
import WrappedReactSelect from '../WrappedReactSelect';

storiesOf("ReactSelect", module)
    .add('normal select', () => <WrappedReactSelect />);