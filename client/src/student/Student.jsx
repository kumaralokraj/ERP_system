import React from 'react'
import {Outlet} from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';

const Student = () => {
  return (
    <div className='flex h-screen w-screen overflow-hidden'>
        <aside className='w-16 md:w-72 shrink-0 overflow-hidden'>
            <Sidebar />
        </aside>

        <main className='flex-1 flex flex-col overflow-hidden bg-gray-100'>
            <Navbar />
            <section className='flex-1 overflow-y-auto'>
                <Outlet />
            </section>
        </main>
    </div>
  )
}

export default Student