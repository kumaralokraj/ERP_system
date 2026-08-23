import React from "react";

//import FormModal from "@/components/FormModal";
import Pagination from "../components/Pagination";
import Table from "../components/Table";
import Sidebar from '../components/Sidebar.jsx';
//import TableSearch from "@/components/TableSearch";
import { role, subjectsData } from "../../lib/data";

const columns = [
    {
        header: "Subject Name",
        accessor: "name",
    },
    {
        header: "Teachers",
        accessor: "teachers",
        className: "hidden md:table-cell",
    },
    {
        header: "Actions",
        accessor: "action",
    },
];

const Subjects = () => {
    const renderRow = (item) => (
        <tr
            key={item.id}
            className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
        >
            <td className="flex items-center gap-4 p-4">
                {item.name}
            </td>

            <td className="hidden md:table-cell">
                {item.teachers.join(", ")}
            </td>

            <td>
                <div className="flex items-center gap-2">
                    {/*role === "admin" && (
            <>
              <FormModal table="subject" type="update" data={item} />
              <FormModal table="subject" type="delete" id={item.id} />
            </>
          )*/}
                </div>
            </td>
        </tr>
    );

    return (
        
                    <div className="bg-white p-4 rounded-md m-4">
                        {/* TOP */}
                        <div className="flex items-center justify-between">
                            <h1 className="hidden md:block text-lg font-semibold">
                                All Subjects
                            </h1>

                            <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                                <div className="flex items-center gap-4 self-end">
                                    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
                                        <img src="/filter.png" alt="Filter" className="w-4 h-4" />
                                    </button>

                                    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
                                        <img src="/sort.png" alt="Sort" className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* TABLE (IMPORTANT FIX) */}
                        <div className="mt-4 overflow-x-auto">
                            <Table
                                columns={columns}
                                renderRow={renderRow}
                                data={subjectsData}
                            />
                        </div>

                        {/* PAGINATION */}
                        <Pagination />
                    </div>


    );
};

export default Subjects;
