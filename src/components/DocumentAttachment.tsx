import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Paperclip, 
  Upload, 
  Download, 
  Trash2, 
  FileText, 
  FileImage, 
  File, 
  CheckCircle2, 
  Loader2,
  Plus
} from 'lucide-react';
import { VehicleDocument } from '../types';

interface DocumentAttachmentProps {
  documents: VehicleDocument[] | undefined;
  onChange: (docs: VehicleDocument[]) => void;
  label?: string;
  isReadOnly?: boolean;
  hideAddFilesButton?: boolean;
}

export default function DocumentAttachment({ 
  documents = [], 
  onChange, 
  label = "Attachments & Verified Documents",
  isReadOnly = false,
  hideAddFilesButton = false
}: DocumentAttachmentProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const processFiles = (files: FileList) => {
    setIsReading(true);
    const promises = Array.from(files).map((file) => {
      return new Promise<VehicleDocument>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const docType: 'pdf' | 'image' | 'other' = file.type.includes('pdf')
            ? 'pdf'
            : file.type.includes('image')
            ? 'image'
            : 'other';

          resolve({
            id: Math.random().toString(36).substring(2, 11),
            name: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
            type: docType,
            fileName: file.name,
            fileSize: (file.size / 1024).toFixed(1) + ' KB',
            uploadDate: new Date().toISOString().substring(0, 10),
            fileData: base64
          });
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises)
      .then((newDocs) => {
        onChange([...documents, ...newDocs]);
      })
      .catch((err) => {
        console.error("Error reading file:", err);
      })
      .finally(() => {
        setIsReading(false);
      });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveDoc = (idToRemove: string) => {
    onChange(documents.filter(doc => doc.id !== idToRemove));
  };

  const getDocIcon = (type: 'pdf' | 'image' | 'other') => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-rose-500" />;
      case 'image':
        return <FileImage className="w-5 h-5 text-emerald-500" />;
      default:
        return <File className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5 text-slate-500" />
          <span>{label}</span>
          <span className="text-[10px] font-mono font-normal text-slate-400 capitalize">({documents.length} files)</span>
        </label>
        
        {!isReadOnly && !hideAddFilesButton && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Files</span>
          </button>
        )}
      </div>

      {/* Drag & Drop Zone */}
      {!isReadOnly && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${
            isDragging 
              ? 'border-teal-500 bg-teal-50/50' 
              : 'border-slate-300 hover:border-slate-400 bg-white'
          } mb-4`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />
          {isReading ? (
            <div className="flex flex-col items-center justify-center space-y-1">
              <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
              <p className="text-xs font-medium text-slate-500">Processing files...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-1">
              <Upload className="w-6 h-6 text-slate-400" />
              <p className="text-xs font-semibold text-slate-600">
                Drag and drop files here, or <span className="text-teal-600 font-bold">browse</span>
              </p>
              <p className="text-[10px] text-slate-400">PDF, JPG, PNG, Excel, Word (Up to 10MB)</p>
            </div>
          )}
        </div>
      )}

      {/* Document Listing */}
      {documents.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {documents.map((doc) => (
            <div 
              key={doc.id}
              className="flex items-center justify-between bg-white border border-slate-100 rounded-lg p-2.5 shadow-sm transition-all hover:border-slate-200"
            >
              <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                {getDocIcon(doc.type)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-700 truncate block">
                      {doc.name}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">({doc.fileSize})</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-mono">
                    Uploaded: {doc.uploadDate} | {doc.fileName}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1 ml-3">
                {doc.fileData ? (
                  <a
                    href={doc.fileData}
                    download={doc.fileName}
                    title="Download document file"
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                ) : (
                  <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">No payload</span>
                )}
                
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDoc(doc.id)}
                    title="Remove attachment"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-2 italic">
          No verified documents attached to this transaction.
        </p>
      )}
    </div>
  );
}
