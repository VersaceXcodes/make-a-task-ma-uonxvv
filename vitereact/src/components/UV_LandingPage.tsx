import React from 'react';
import { Link } from 'react-router-dom';

const UV_LandingPage = () => {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">Welcome to Make-a-Task</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-lg text-gray-700 mb-4">
            Your personal task management solution.
          </p>
          <Link
            to="/find/example"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UV_LandingPage;