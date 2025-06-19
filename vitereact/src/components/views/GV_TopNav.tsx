import React from 'react';

const GV_TopNav: React.FC = () => {
  return (
    <nav className="bg-white shadow">
      <div className="container mx-auto px-4 py-3">
        {/* Add your navigation content here */}
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold">Task Manager</div>
          <div>{/* Add navigation links/menu here */}</div>
        </div>
      </div>
    </nav>
  );
};

export default GV_TopNav;