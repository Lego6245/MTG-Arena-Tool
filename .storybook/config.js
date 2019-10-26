import { configure } from '@storybook/react';
import '../src/window_main/index.css';
import '../src/shared/shared.css';

// automatically import all files ending in *.stories.js
configure(require.context('../src', true, /\.stories\.(j|t)?sx$/), module);
