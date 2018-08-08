import * as fs from 'fs';
import * as gm from 'gm';
import * as path from 'path';

const im = gm.subClass({
  imageMagick: true,
});

export interface IVersion {
  height: number;
}

export type TImageFormat = 'GIF' | 'PNG' | 'JPEG';


const getProcessedFileName = (args: {
  absolute_file_path: string,
  width: number,
  height: number,
  version: IVersion | null
}): string => {
  const ext = path.extname(args.absolute_file_path);
  const base_name = path.basename(args.absolute_file_path, ext);
  const aspect_ratio: number = Number((args.width / args.height).toFixed(3));
  return `${base_name}_aspR_${aspect_ratio}_w${args.width}_h${args.height}_e${args.version ? args.version.height : ''}${ext}`;
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
    throw new Error('file must have a valid base name when excluding extension');
  }
};

const validateOutputDirectory = async (absolute_output_directory: string): Promise<void> => {
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
  absolute_file_path: string,
  absolute_output_directory: string,
  versions: IVersion[]
}): Promise<{
  // a file name for each version
  // e.g.
  // original: jovin_aspR_0.5_w200_h100_e.jpg
  // 80: jovin_aspR_0.5_w200_h100_e80.jpg
  // 200: jovin_aspR_0.5_w200_h100_e200.jpg
  // 400: jovin_aspR_0.5_w200_h100_e400.jpg
  [key: string]: string
}> => {
  await validateFile(args.absolute_file_path);
  await validateOutputDirectory(args.absolute_output_directory);
  const result_value: {
    [key: string]: string
  } = {};

  const acceptableFormats = ['GIF', 'PNG', 'JPEG'];
  let image_width: number;
  let image_height: number;
  let file_size_kb: number;
  let processor: gm.State = im(args.absolute_file_path);

  const dimensions = await new Promise<{ width: number, height: number }>((resolve, reject) => {
    processor = processor.size((err, size) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          width: size.width,
          height: size.height,
        });
      }
    });
  });

  image_width = dimensions.width;
  image_height = dimensions.height;

  file_size_kb = await new Promise<number>((resolve, reject) => {
    processor = processor.filesize((err, size) => {
      if (err) {
        reject(err);
      } else {
        if (size.includes('GB')) {
          resolve(Number(parseFloat(size)) * 1000000 || 0.0);
        } else if (size.includes('MB')) {
          resolve(Number(parseFloat(size)) * 1000 || 0.0);
        } else if (size.includes('KB')) {
          resolve(Number(parseFloat(size)) || 0.0);
        } else if (size.includes('B')) {
          resolve(Number(parseFloat(size)) / 1000 || 0.0);
        } else {
          reject('no unit on returned size');
        }
      }
    });
  });

  await new Promise<TImageFormat>((resolve, reject) => {
    processor = processor.format((err, format) => {
      if (err) {
        reject(err);
      } else {
        if (acceptableFormats.indexOf(format) === -1) {
          reject(new Error('The image format was not recognized. Only jpeg, png and gif files are allowed'));
        } else {
          resolve(format as TImageFormat);
        }
      }
    });
  });

  // prepare original file, not resized, this will be considered for giving the link to the original optimized file
  await new Promise((resolve, reject) => {
    const file_output_path = path.join(args.absolute_output_directory, getProcessedFileName({
      absolute_file_path: args.absolute_file_path,
      width: image_width,
      height: image_height,
      version: null,
    }));
    im(args.absolute_file_path)
      .filter('Triangle')
      .define('filter:support=2')
      .unsharp(0.25, 0.25, 8, 0.065)
      .quality(82)
      .define('jpeg:fancy-upsampling=off')
      .define('png:compression-filter=5')
      .define('png:compression-level=9')
      .define('png:compression-strategy=1')
      .define('png:exclude-chunk=all')
      .interlace('None')
      .colorspace('sRGB')
      .write(file_output_path, (err) => {
        if (err) {
          reject(err);
        } else {
          result_value.original = path.basename(file_output_path);
          resolve();
        }
      });
  });

  // prepare the other versions
  const processPromises: Promise<any>[] = [];
  args.versions.map(version => {
    processPromises.push(new Promise((resolve, reject) => {
      const file_output_path = path.join(args.absolute_output_directory, getProcessedFileName({
        absolute_file_path: args.absolute_file_path,
        width: image_width,
        height: image_height,
        version,
      }));
      let processor = im(args.absolute_file_path);
      processor = processor
        .filter('Triangle')
        .define('filter:support=2')
        .unsharp(0.25, 0.25, 8, 0.065)
        .quality(82)
        .define('jpeg:fancy-upsampling=off')
        .define('png:compression-filter=5')
        .define('png:compression-level=9')
        .define('png:compression-strategy=1')
        .define('png:exclude-chunk=all')
        .interlace('None')
        .colorspace('sRGB');

      if (version.height < 400 || (version.height >= 400 && file_size_kb >= 70.0)) {
        processor = processor
        // @ts-ignore
          .resize(null, version.height);
      }

      processor.write(file_output_path, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          result_value[version.height] = path.basename(file_output_path);
          resolve();
        }
      });
    }));
  });

  await Promise.all(processPromises);

  return result_value;
};

export const processImages = async (args: {
  absolute_directory_path: string,
  absolute_output_directory_path: string,
  versions: IVersion[]
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
    [key: string]: string
  }
}> => {
  await validateOutputDirectory(args.absolute_directory_path);
  await validateOutputDirectory(args.absolute_output_directory_path);

  const return_value: {
    [key: string]: {
      [key: string]: string
    }
  } = {};

  const file_names: string[] = await new Promise<string[]>((resolve, reject) => {
    fs.readdir(args.absolute_directory_path, (err, file_paths) => {
      if (err) {
        reject(err);
      } else {
        resolve(file_paths);
      }
    });
  });

  await Promise.all(
    file_names
      .filter(name => ['.jpg', '.jpeg', '.gif', '.png'].includes(path.extname(name.toLowerCase())))
      .map(file_path => {
        return new Promise((resolve, reject) => {
          processImageFile({
            absolute_file_path: path.join(args.absolute_directory_path, file_path),
            absolute_output_directory: args.absolute_output_directory_path,
            versions: args.versions,
          })
            .then(v => {
              return_value[path.basename(file_path)] = v;
              resolve();
            })
            .catch(reject);
        });
      }),
  );

  return return_value;
};
