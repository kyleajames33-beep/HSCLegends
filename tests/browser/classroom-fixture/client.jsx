import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import Fixture from './app.jsx';
import { configure } from './fixture-state.mjs';
configure(location.pathname.slice(1).split('.')[0] || 'fresh');
hydrateRoot(document.getElementById('root'), <Fixture />, { onRecoverableError(e) { window.__recoverable(e); } });
