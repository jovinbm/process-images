import fileType, { FileTypeResult } from 'file-type';
import * as fs from 'fs';
import imageSize from 'image-size';
import imagemin from 'imagemin';
import imageminGifsicle from 'imagemin-gifsicle';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminPngquant from 'imagemin-pngquant';
import Jimp from 'jimp';
import * as path from 'path';
import readChunk from 'read-chunk';

export interface IVersion {
  height: number;
}

export type TImageFormat = 'GIF' | 'PNG' | 'JPEG';

const getProcessedFileName = (args: {
  absolute_file_path: string;
  width: number;
  height: number;
  version: IVersion | null;
}): string => {
  const ext = path.extname(args.absolute_file_path);
  const base_name = path.basename(args.absolute_file_path, ext);
  const aspect_ratio: number = Number((args.width / args.height).toFixed(3));
  return `${base_name}_aspR_${aspect_ratio}_w${args.width}_h${args.height}_e${
    args.version ? args.version.height : ''
  }${ext}`;
};

const validateFile = async (absolute_file_path: string): Promise<void> => {
  // must be absolute path
  if (!path.isAbsolute(absolute_file_path)) {
    throw new Error('Path to image has to be absolute');
  }

  // must be a file
  await new Promise((resolve, reject) => {
    fs.lstat(absolute_file_path, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        if (!stats.isFile()) {
          reject(new Error('path not a file'));
        } else {
          resolve();
        }
      }
    });
  });

  // must have an extension
  // path.extname('index.html'); = .html
  // ext of index. is still '.' so length must be > 1
  const ext = path.extname(absolute_file_path);
  if (ext.length < 2) {
    throw new Error('file must have a valid extension');
  }

  // must have a valid basename
  // path.basename('/foo/bar/baz/asdf/quux.html', '.html'); = quux
  if (path.basename(absolute_file_path, ext).length < 1) {
    throw new Error(
      'file must have a valid base name when excluding extension'
    );
  }
};

const validateOutputDirectory = async (
  absolute_output_directory: string
): Promise<void> => {
  // must be absolute path
  if (!path.isAbsolute(absolute_output_directory)) {
    throw new Error('Path to output folder has to be absolute');
  }

  // must be a folder
  await new Promise((resolve, reject) => {
    fs.lstat(absolute_output_directory, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        if (!stats.isDirectory()) {
          reject(new Error('output directory path not directory'));
        } else {
          resolve();
        }
      }
    });
  });
};

const processImageFile = async (args: {
  absolute_file_path: string;
  absolute_output_directory: string;
  versions: IVersion[];
}): Promise<{
  // a file name for each version
  // e.g.
  // original: jovin_aspR_0.5_w200_h100_e.jpg
  // 80: jovin_aspR_0.5_w200_h100_e80.jpg
  // 200: jovin_aspR_0.5_w200_h100_e200.jpg
  // 400: jovin_aspR_0.5_w200_h100_e400.jpg
  [key: string]: string;
}> => {
  await validateFile(args.absolute_file_path);
  await validateOutputDirectory(args.absolute_output_directory);
  const result_value: {
    [key: string]: string;
  } = {};
  let file_type_result: FileTypeResult | undefined;
  let image_width: number;
  let image_height: number;

  await Promise.all([
    new Promise((resolve, reject) => {
      imageSize(args.absolute_file_path, (err, dimensions) => {
        if (err) {
          reject(err);
        } else {
          image_width = dimensions.width;
          image_height = dimensions.height;
          resolve();
        }
      });
    }),
    new Promise((resolve, reject) => {
      readChunk(args.absolute_file_path, 0, fileType.minimumBytes)
        .then(buffer => {
          file_type_result = fileType(buffer);
          resolve();
        })
        .catch(reject);
    }),
  ]);

  if (!file_type_result) {
    throw new Error('The image format was not recognized.');
  }

  if (['png', 'gif', 'jpg'].indexOf(file_type_result.ext) === -1) {
    throw new Error('The image is not png, gif or jpg.');
  }

  // resize the images
  const processPromises: Promise<any>[] = [];
  args.versions.map(version => {
    // prepare the versions
    processPromises.push(
      Promise.resolve().then(() => {
        const file_output_path = path.join(
          args.absolute_output_directory,
          getProcessedFileName({
            absolute_file_path: args.absolute_file_path,
            width: image_width,
            height: image_height,
            version,
          })
        );
        return Jimp.read(args.absolute_file_path)
          .then(img => {
            return img
              .resize(Jimp.AUTO, version.height)
              .write(file_output_path);
          })
          .then(() => {
            result_value[version.height] = path.basename(file_output_path);
          });
      })
    );
  });

  // copy the original image to final directory
  processPromises.push(
    Promise.resolve().then(() => {
      const file_output_path = path.join(
        args.absolute_output_directory,
        getProcessedFileName({
          absolute_file_path: args.absolute_file_path,
          width: image_width,
          height: image_height,
          version: null,
        })
      );
      return Jimp.read(args.absolute_file_path)
        .then(img => {
          return img.write(file_output_path);
        })
        .then(() => {
          result_value.original = path.basename(file_output_path);
        });
    })
  );

  await Promise.all(processPromises);

  // compress and optimize all images
  await imagemin(
    [`${args.absolute_output_directory}/*.{jpg,png}`],
    args.absolute_output_directory,
    {
      plugins: [
        imageminGifsicle({
          colors: 256,
          interlaced: true,
          optimizationLevel: 3,
        }),
        imageminJpegtran({ progressive: true }),
        imageminPngquant({ quality: [0.85, 1], strip: true }),
      ],
    }
  );
  return result_value;
};

export const processImages = async (args: {
  absolute_directory_path: string;
  absolute_output_directory_path: string;
  versions: IVersion[];
}): Promise<{
  // key here is the original file name of image
  // e.g jovin.jpg
  [key: string]: {
    // a file name for each version
    // e.g.
    // original: jovin_aspR_0.5_w200_h100_e.jpg
    // 80: jovin_aspR_0.5_w200_h100_e80.jpg
    // 200: jovin_aspR_0.5_w200_h100_e200.jpg
    // 400: jovin_aspR_0.5_w200_h100_e400.jpg
    [key: string]: string;
  };
}> => {
  await validateOutputDirectory(args.absolute_directory_path);
  await validateOutputDirectory(args.absolute_output_directory_path);

  const return_value: {
    [key: string]: {
      [key: string]: string;
    };
  } = {};

  const file_names: string[] = await new Promise<string[]>(
    (resolve, reject) => {
      fs.readdir(args.absolute_directory_path, (err, file_paths) => {
        if (err) {
          reject(err);
        } else {
          resolve(file_paths);
        }
      });
    }
  );

  await Promise.all(
    file_names
      .filter(name =>
        ['.jpg', '.jpeg', '.gif', '.png'].includes(
          path.extname(name.toLowerCase())
        )
      )
      .map(file_path => {
        console.log(file_path);
        return new Promise((resolve, reject) => {
          processImageFile({
            absolute_file_path: path.join(
              args.absolute_directory_path,
              file_path
            ),
            absolute_output_directory: args.absolute_output_directory_path,
            versions: args.versions,
          })
            .then(v => {
              return_value[path.basename(file_path)] = v;
              resolve();
            })
            .catch(reject);
        });
      })
  );

  return return_value;
};
