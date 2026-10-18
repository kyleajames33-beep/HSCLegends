import React from 'react';
import { renderToString } from 'react-dom/server';
import Fixture from './app.jsx';
import { configure } from './fixture-state.mjs';
export function render(scenario) { configure(scenario); return renderToString(<Fixture />); }
