import React from 'react';
import { useParams } from 'react-router-dom';

const UV_OtherViewExample = () => {
  const { slugexample } = useParams();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-3xl font-semibold text-gray-900 mb-4">
          Example View
        </h2>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-700">
            Slug parameter from URL: {slugexample}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UV_OtherViewExample;