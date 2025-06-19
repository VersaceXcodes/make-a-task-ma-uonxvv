import React from 'react';

const GV_Footer: React.FC = () => {
  return (
    <footer className="bg-gray-100 mt-auto">
      <div className="container mx-auto px-4 py-4">
        <div className="text-center text-gray-600">
          {/* Add your footer content here */}
          <p>&copy; {new Date().getFullYear()} Task Manager. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default GV_Footer;