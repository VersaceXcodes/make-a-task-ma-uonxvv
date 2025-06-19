import React from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { store } from './redux/store'; // Adjust import path accordingly
import UV_LandingPage from './components/UV_LandingPage'; // Adjust paths
import UV_OtherViewExample from './components/UV_OtherViewExample';

// Optional: Implement or import an Error Boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log error
    console.error('Error Boundary Caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}

const AppRoot = () => {
  return (
    <ReduxProvider store={store}>
      <BrowserRouter>
        <ErrorBoundary>
          {/* You can add Theme providers or global styles here */}
          <Routes>
            <Route path="/" element={<UV_LandingPage />} />
            <Route path="/find/:slugexample" element={<UV_OtherViewExample />} />
            {/* Add additional routes as needed */}
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </ReduxProvider>
  );
};

export default AppRoot;